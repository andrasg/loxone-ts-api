export function maskProperties(input: string, maskedProperties: string[]): string {
  let output = input;
  for (const maskedProperty of maskedProperties) {
    const pattern = new RegExp(`("${maskedProperty}":")([^"]+)(")`, "g");
    output = output.replace(pattern, "$1***masked***$3");
  }

  return output;
}

export function maskEnc(input: string | undefined): string | undefined {
  if (!input) return input;
  let output = input;
  const pattern = new RegExp(`(jdev/sys/enc/)(.{8})(.*)`, "g");
  output = output.replace(pattern, "$1$2...");
  return output;
}
