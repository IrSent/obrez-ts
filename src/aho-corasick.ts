export class FastAhoScanner {
    private nodesData: DataView;
    private edges: Record<number, Record<string, number>>;
    private readonly NODE_SIZE = 8;

    constructor(buffer: ArrayBuffer) {
        const view = new DataView(buffer);
        const nodeCount = view.getUint32(0, true);

        // Срез данных узлов
        this.nodesData = new DataView(buffer, 4, nodeCount * this.NODE_SIZE);

        // Читаем JSON переходов, который мы приклеили в конец файла
        const jsonOffset = 4 + (nodeCount * this.NODE_SIZE);
        const decoder = new TextDecoder();
        this.edges = JSON.parse(decoder.decode(new Uint8Array(buffer, jsonOffset)));
    }

    private getFailId(nodeId: number): number {
        return this.nodesData.getInt32(nodeId * this.NODE_SIZE, true);
    }

    private isTerminal(nodeId: number): boolean {
        return this.nodesData.getUint8(nodeId * this.NODE_SIZE + 4) === 1;
    }

    public findMatches(text: string) {
        let currentState = 0;
        const results = [];

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Ищем переход в объекте edges
            while (currentState !== 0 && !(this.edges[currentState]?.[char])) {
                currentState = this.getFailId(currentState);
            }

            currentState = this.edges[currentState]?.[char] ?? 0;

            if (this.isTerminal(currentState)) {
                results.push({ index: i, state: currentState });
            }
        }
        return results;
    }
}
