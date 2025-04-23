export type Obstacle = {
    type: Obstacle.Type,
    direction: Obstacle.Direction,
    duration: number
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

    const defaultObstacle: Obstacle = {
        type: types.none,
        direction: directions.none,
        duration: 0
    }
    
    /**
     * OBS: Mutates input object!
     * @param partial Partial Obstacle
     * @returns Fully qualified Obstacle
     */
    export function fill(partial: Partial<Obstacle>) {
        for(const key in defaultObstacle) {
            if(!(partial as any)[key]) {
                (partial as any)[key] = defaultObstacle[key as keyof Obstacle]
            }
        }
        return partial as Obstacle
    }
}