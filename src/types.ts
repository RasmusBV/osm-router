
export type Node = {
    type: "node",
    id: NodeId,
    lat: number,
    lon: number,
    tags?: Record<string, string>,
}

export type NodeId = number & {__brand: Node}

export type Way = {
    type: "way",
    id: WayId,
    refs: NodeId[],
    tags?: Record<string, string>
}

export type WayId = number & {__brand: Way}

export type ProcessedWay = WayInfo & Way

export type WayInfo = {
    speed: Both<number>,
    multiplier: Both<number>,
    innaccessible: Both<boolean>,
    restricted: Both<boolean>,
}

export const defaultWayInfo = (): WayInfo => ({
    speed: {forward: 0, backward: 0},
    multiplier: {forward: 1, backward: 1},
    innaccessible: {forward: false, backward: false},
    restricted: {forward: false, backward: false}
})

type Both<T> = {forward: T, backward: T}

export type Relation = {
    type: "relation",
    id: RelationId,
    members: Member[]
    tags: Record<string, string>
}

export type WayMember = {
    type: "way",
    ref: WayId,
    role: string
}

export type NodeMember = {
    type: "node",
    ref: NodeId,
    role: string
}

export type RelationMember = {
    type: "relation",
    ref: RelationId,
    role: string
}

export type Member = WayMember | NodeMember | RelationMember

export type RelationId = number & {__brand: Relation}

export type Id = NodeId | WayId | RelationId
export type Element = Node | Way | Relation


export type Edge = {
    way: ProcessedWay, 
    cost: number, 
    nodes: NodeId[]
}