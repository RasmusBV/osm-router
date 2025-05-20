
/**
 * Simple object for logging. Allows for structured JSON logging aswell
 * as highlighting the toString method for human readable logs.
 */
export type Info = {
    toString(): string
    [x: string]: any
}

export namespace Info {
    export class Progress implements Info {
        type = "Progress"
        constructor(
            public progress: Record<string, [number, number?]>
        ) {}

        toString() {
            return this.type + "\n" + Object.entries(this.progress).map(([name, progress]) => {
                if(progress.length > 1) {
                    return `${name}: ${progress[0]} / ${progress[1]}`
                } else {
                    return `${name}: ${progress[0]}`
                }
            }).join("\n") + "\n"
        }
    }
    export class Message implements Info {
        type = "Message"
        constructor(
            public message: string
        ) {}
        toString() {
            return this.message
        }
    }
    export class ErrorLike implements Info {
        constructor(
            public type: string, 
            public data: Record<string, any>
        ) {}

        toString() {
            return this.type + "\n" + JSON.stringify(this.data, null, 2)
        }
    }
}