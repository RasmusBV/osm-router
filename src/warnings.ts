import * as OSM from "./types"

export enum WarningType {
    MissingNode = "MissingNode",
    MalformedWay = "MalformedWay",
    MissingEdge = "MissingEdge"
}

export type WarningData = {
    [WarningType.MissingNode]: {
        nodeId: OSM.NodeId,
        way: OSM.Way
    },
    [WarningType.MalformedWay]: {
        way: OSM.Way
    },
    [WarningType.MissingEdge]: {
        from: OSM.Node,
        to: OSM.Node
    }
}

export type Warning<T extends WarningType = WarningType> = {type: T, data: WarningData[T]}

export function warning<T extends WarningType>(type: T, data: WarningData[T]): Warning<T> {
    return {type, data}
}

export function toString(warning: Warning) {
    return warning.type + "\n" + JSON.stringify(warning.data, null, 2)
}

export function toError(warning: Warning) {
    return new Error(warning.type, {cause: warning.data})
}