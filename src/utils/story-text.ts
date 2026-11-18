export function normalizeDialogueQuotes(text: string): string {
  return text.replace(
    /(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`[^`\n]*`)|(^|[^\p{L}\p{N}])['‘]([^\n]*?\S)['’](?=$|[\s.,!?;:)\]}*_~])/gmu,
    (_match, code: string | undefined, prefix: string, dialogue: string) => {
      if (code !== undefined) return code;
      return `${prefix}“${dialogue}”`;
    },
  );
}
