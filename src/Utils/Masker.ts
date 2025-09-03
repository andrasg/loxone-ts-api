export function maskProperties(input: string, maskedProperties: string[]): string {
    for (const maskedProperty of maskedProperties) {
        const pattern = new RegExp(`("${maskedProperty}":")([^"]+)(")`, 'g');
        input = input.replace(pattern, '$1***masked***$3');
    }

    return input;
}

export function maskEnc(input: string | undefined): string | undefined {
    if (!input) return input;
    const pattern = new RegExp(`(jdev/sys/enc/)(.{8})(.*)`, 'g');
    input = input.replace(pattern, '$1$2...');
    return input;
}
