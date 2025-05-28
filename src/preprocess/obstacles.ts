
/**
 * **Obstacles** is a concept borrowed from OSRM, read more at
 * 
 * https://github.com/Project-OSRM/osrm-backend/blob/master/docs/profiles.md#obstacle
 */
export type Obstacle = {
    type: Obstacle.Type,
    direction: Obstacle.Direction,
    duration: number | undefined
}

export namespace Obstacle {
    const _Types = [
        "none",
        "barrier",
        "traffic_signals",
        "stop",
        "stop_minor",
        "give_way",
        "crossing",
        "traffic_calming",
        "mini_roundabout",
        "turning_loop",
        "turning_circle",
    ] as const

    export type Types = {
        [K in (typeof _Types)[number]]: K
    }
    export type Type = Types[keyof Types]

    export const types = Object.fromEntries(_Types.map((type) => [type, type])) as Types

    
    const _Directions = [
        "none",
        "forward",
        "backward",
        "both"
    ] as const


    export type Directions = {
        [K in (typeof _Directions)[number]]: K
    }
    export type Direction = Directions[keyof Directions]

    export const directions = Object.fromEntries(_Directions.map((type) => [type, type])) as Directions

    let defaultObstacle: Obstacle = {
        type: types.none,
        direction: directions.none,
        duration: undefined
    }

    export function getDefault() {
        return {...defaultObstacle}
    }
    /**
     * Set the global default Obstacle
     */
    export function setDefault(obstacle: Obstacle) {
        defaultObstacle = obstacle
    }
}