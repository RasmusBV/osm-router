import type { Obstacle } from "./preprocess/obstacles.js"

type CustomInfo<T extends Record<string, any>> = {
    custom: T
}

export type Node = {
    type: "node",
    id: NodeId,
    lat: number,
    lon: number,
    tags?: Record<string, string>,
}

export type NodeId = number & {__brand: Node}

export type ProcessedNode<T extends Record<string, any>> = NodeInfo & Node & CustomInfo<T>

export type NodeInfo = {
    obstacles?: Obstacle[]
}

export type Way = {
    type: "way",
    id: WayId,
    refs: NodeId[],
    tags?: Record<string, string>
}

export type WayId = number & {__brand: Way}

export type ProcessedWay<T extends Record<string, any>> = WayInfo & Way & CustomInfo<T>

export type WayInfo = {
    speed: Both<number>,
    multiplier: Both<number>,
    innaccessible: Both<boolean>
}

export const defaultWayInfo = (): WayInfo & CustomInfo<{}> => ({
    speed: {forward: 0, backward: 0},
    multiplier: {forward: 1, backward: 1},
    innaccessible: {forward: false, backward: false},
    custom: {}
})

export enum Direction {
    Forward = "forward",
    Backward = "backward"
}

export const Directions = [Direction.Forward, Direction.Backward]

type Both<T> = {[Direction.Forward]: T, [Direction.Backward]: T}

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

export type ProcessedRelation<T extends Record<string, any>> = Relation & CustomInfo<T>

export type Id = NodeId | WayId | RelationId

export type RawElement = Node | Way | Relation

export type CustomData = {
    node: Record<string, any>
    way: Record<string, any>
    relation: Record<string, any>
}

export type NamedElement<T extends Record<string, any>> = {
    node: ProcessedNode<T>
    way: ProcessedWay<T>
    relation: ProcessedRelation<T>
}

export type AllElements<D extends CustomData> = ProcessedNode<D["node"]> | ProcessedWay<D["way"]> | ProcessedRelation<D["relation"]>

export type Element<T extends Record<string, any>> = ProcessedNode<T> | ProcessedWay<T> | ProcessedRelation<T>

export type Edge<T extends Record<string, any>> = {
    way: ProcessedWay<T>, 
    length: number
    cost: number, 
    nodes: NodeId[]
}