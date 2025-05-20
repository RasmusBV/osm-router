
const DATA_VIEW_ACCESSORS = {
    getFloat32: 4,
    getFloat64: 8,

    getInt8: 1,
    getInt16: 2,
    getInt32: 4,
    getBigInt64: 8,

    getUint8: 1,
    getUint16: 2,
    getUint32: 4,
    getBigUint64: 8
} as const

type NamedAccessor<T extends string> = {
    readonly name: T
    readonly method: keyof typeof DATA_VIEW_ACCESSORS
}

export type Accessor = NamedAccessor<string> | {
    readonly padding: number
}

export type DataAccessors<T extends readonly Accessor[]> = {
    -readonly [K in keyof T as T[K] extends NamedAccessor<infer S> ? S : never]: (index: number) => number
}

export function generateAccessor<T extends readonly Accessor[]>(
    buffer: DataView<ArrayBuffer>, 
    accessors: T,
    littleEndian: boolean,
    alignment: number
) {
    let size = 0
    const obj: Record<string, (index: number) => number> = {}
    for(const accessor of accessors) {
        if("padding" in accessor) {
            size += accessor.padding
            continue
        }
        const accessorOffset = size
        size += DATA_VIEW_ACCESSORS[accessor.method]
        const methodFunc = buffer[accessor.method].bind(buffer)
        obj[accessor.name] = (index: number) => {
            const offset = index * size + accessorOffset
            return Number(methodFunc(offset, littleEndian))
        }
    }
    size = Math.ceil(size / alignment) * alignment
    return obj as DataAccessors<T>
}
