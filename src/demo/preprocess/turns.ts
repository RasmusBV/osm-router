import { profile } from "./profile.js"
import { Preprocess } from "../../index.js"

// Inspired by the car profile from project OSRM
// https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua

export function processTurn(
    turn: Readonly<Preprocess.Turn<any, any>>,
    junction: Readonly<Preprocess.Junction<any, any>>,
    data: Preprocess.OSMData
) {
    let duration = 0
    const obstacles = data.getObstacles(turn.fromEdge.way, turn.fromNode, turn.viaNode)
    for(const obstacle of obstacles) {
        duration += (obstacle.duration ?? 0)
    }
    // https://github.com/Project-OSRM/osrm-backend/blob/4ee9968e3b585ee8ef28aec4a7fe3cfdea1f9ea2/profiles/car.lua#L497
    if(junction.from.size > 1 || junction.to.size > 1) {
        if(Math.abs(turn.angle) > 110) { return undefined }
        duration += 7.5 / (
            1 + Math.exp(-(12 * Math.abs(turn.angle)/180 - 7))
        )
    }
    if(Math.abs(turn.angle) > 135) {
        duration += profile.u_turn_penalty
    }
    if(!turn.fromEdge.way.restricted && turn.toEdge.way.restricted) {
        duration = 10_000 // Arbitrary large number
    }
    return duration
}