export type CostFunction = (previous: RouteNode | null, edgeIndex: number, turnCost: number) => number

export type RoutingOptions = {
    /**
     * Maximum cost allowed to exceed the best found cost.
     * 
     * This is used to allow some flexibility in the search for a route, allowing it to explore paths that may not be optimal but could lead to a better solution.
     */
    maxCostPastBest: number,
    
    /**
     * Function to calculate the dynamic cost of a route segment.
     * This cost is in addition to the fixed cost of the route segment and is not cumulative.
     */
    dynamicCostFunction: CostFunction,
}

/**
 * Enum representing the direction of traversal in the graph.
 * This is used to determine the direction of the search in Dijkstra's algorithm.
 */
export const enum Direction {
    Forward = 0,
    Backward = 1
}

export const Directions = [Direction.Forward, Direction.Backward]

export const defaultOptions: RoutingOptions = {
    maxCostPastBest: 0,
    dynamicCostFunction: () => 0
}

export type RouteNode = {
    edgeIndex: number, 
    fixedCost: number, 
    dynamicCost: number, 
    totalLength: number,
    totalCost: number,
    index: number
    parent: RouteNode | null
}

export namespace RouteNode {
    export function iter(candidate: RouteNode | null | undefined, callback: (val: RouteNode, i: number) => void) {
        let current = candidate
        let k = 0
        while(current) {
            callback(current, k)
            k++
            current = current.parent
        }
    }
}

export function fixedCostFunction(previous: RouteNode | null, _: number, turnCost: number) {
    return turnCost + (previous?.fixedCost ?? 0)
}