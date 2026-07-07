/// <reference types="node" />
// Leave this file as it is, it's meant to run in the build process and generate audio to be used at runtime. Do not alter this file
import { Plugin } from "esbuild";
import { Project, SyntaxKind, Node, SourceFile } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

export interface AudioSpeakerEntry {
  speaker: string;
  voiceName: string;
}

export interface AudioEntry {
  text: string;
  voiceName?: string;
  speakers?: AudioSpeakerEntry[];
  source: string; // file + line for debugging
}

export function audioExtractPlugin(
  outPath = "dist/audio-manifest.json",
): Plugin {
  return {
    name: "audio-extract",
    setup(build) {
      build.onStart(() => {
        const entries: AudioEntry[] = [];
        const project = new Project({ tsConfigFilePath: "tsconfig.json" });

        for (const sourceFile of project.getSourceFiles()) {
          // Skip node_modules / .d.ts
          if (sourceFile.getFilePath().includes("node_modules")) continue;
          if (sourceFile.getFilePath().endsWith(".d.ts")) continue;

          // Find all sdk.audio.speak(...) calls
          const calls = sourceFile
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter((call) => {
              const expr = call.getExpression();
              return (
                Node.isPropertyAccessExpression(expr) &&
                expr.getName() === "speak" &&
                expr.getExpression().getText().endsWith("audio")
              );
            });

          for (const call of calls) {
            const args = call.getArguments();
            if (args.length === 0) continue;

            const textArg = args[0];
            const optionsArg = args[1];

            // --- Resolve text ---
            const text = resolveSpeechTextValue(textArg, sourceFile);
            if (text === null) {
              const loc = `${path.relative(process.cwd(), sourceFile.getFilePath())}:${textArg.getStartLineNumber()}`;
              console.warn(
                `[audio-extract] ⚠ Dynamic/unresolvable text at ${loc} — skipping`,
              );
              continue;
            }

            // --- Resolve voiceName/speakers from options object ---
            let voiceName: string | undefined;
            let speakers: AudioSpeakerEntry[] | undefined;
            if (optionsArg && Node.isObjectLiteralExpression(optionsArg)) {
              const voiceProp = optionsArg
                .getProperties()
                .find(
                  (p) =>
                    Node.isPropertyAssignment(p) && p.getName() === "voiceName",
                );
              if (voiceProp && Node.isPropertyAssignment(voiceProp)) {
                const val = resolveStringValue(
                  voiceProp.getInitializer()!,
                  sourceFile,
                );
                if (val !== null) voiceName = val;
              }

              const speakersProp = optionsArg
                .getProperties()
                .find(
                  (p) =>
                    Node.isPropertyAssignment(p) && p.getName() === "speakers",
                );
              if (speakersProp && Node.isPropertyAssignment(speakersProp)) {
                speakers = resolveSpeakersValue(speakersProp.getInitializer()!, sourceFile);
              }
            }

            const loc = `${path.relative(process.cwd(), sourceFile.getFilePath())}:${call.getStartLineNumber()}`;
            entries.push({ text, voiceName, speakers, source: loc });
          }
        }

        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
        console.log(
          `[audio-extract] ✓ Found ${entries.length} speak() calls → ${outPath}`,
        );
      });
    },
  };
}

/**
 * Try to resolve a Node to a plain string value.
 * Handles: string literals, no-expression template literals, and
 * const variable references whose initializer is one of the above.
 */
function resolveStringValue(node: Node, sourceFile: SourceFile): string | null {
  // Direct string literal
  if (Node.isStringLiteral(node)) {
    return node.getLiteralValue();
  }

  // Template literal with NO expressions: `hello world`
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }

  // Identifier → chase to its declaration
  if (Node.isIdentifier(node)) {
    const symbol = node.getSymbol();
    const decls = symbol?.getDeclarations() ?? [];
    for (const decl of decls) {
      // const foo = "..." or let foo = "..."
      if (Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        if (init) return resolveStringValue(init, sourceFile);
      }
    }
  }

  return null; // dynamic or unresolvable
}

function resolveSpeechTextValue(node: Node, sourceFile: SourceFile): string | null {
  const direct = resolveStringValue(node, sourceFile);
  if (direct !== null) return direct;

  // sdk.audio.speak([PROFILE, TRANSCRIPT], ...) encourages static prompt
  // composition while preserving build-time extraction.
  if (Node.isArrayLiteralExpression(node)) {
    let text = "";
    for (const element of node.getElements()) {
      const part = resolveStringValue(element, sourceFile);
      if (part === null) return null;
      text += part;
    }
    return text;
  }

  if (Node.isIdentifier(node)) {
    const symbol = node.getSymbol();
    const decls = symbol?.getDeclarations() ?? [];
    for (const decl of decls) {
      if (Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        if (init) return resolveSpeechTextValue(init, sourceFile);
      }
    }
  }

  return null;
}

function resolveSpeakersValue(
  node: Node,
  sourceFile: SourceFile,
): AudioSpeakerEntry[] | undefined {
  if (Node.isIdentifier(node)) {
    const symbol = node.getSymbol();
    const decls = symbol?.getDeclarations() ?? [];
    for (const decl of decls) {
      if (Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        if (init) return resolveSpeakersValue(init, sourceFile);
      }
    }
  }

  if (!Node.isArrayLiteralExpression(node)) return undefined;

  const speakers: AudioSpeakerEntry[] = [];
  for (const element of node.getElements()) {
    if (!Node.isObjectLiteralExpression(element)) return undefined;

    const speakerProp = element
      .getProperties()
      .find(
        (p) => Node.isPropertyAssignment(p) && p.getName() === "speaker",
      );
    const voiceProp = element
      .getProperties()
      .find(
        (p) => Node.isPropertyAssignment(p) && p.getName() === "voiceName",
      );

    if (
      !speakerProp ||
      !Node.isPropertyAssignment(speakerProp) ||
      !voiceProp ||
      !Node.isPropertyAssignment(voiceProp)
    ) {
      return undefined;
    }

    const speaker = resolveStringValue(speakerProp.getInitializer()!, sourceFile);
    const voiceName = resolveStringValue(voiceProp.getInitializer()!, sourceFile);
    if (speaker === null || voiceName === null) return undefined;
    speakers.push({ speaker, voiceName });
  }

  return speakers.length ? speakers : undefined;
}
