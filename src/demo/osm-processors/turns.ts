import { profile } from "./profile.js"
import * as Preprocess from "../../preprocess/index.js"

export function processTurn(
    turn: Readonly<Preprocess.Turn>,
    junction: Readonly<Preprocess.Junction>,
    data: Preprocess.OSMData
) {
    let duration = 0
    const turnPenalty = profile.turn_penalty
    const turnBias = profile.turn_bias
    const obstacles = data.getObstacles(turn.fromEdge.way, turn.fromNode, turn.viaNode)
    for(const obstacle of obstacles) {
        duration += obstacle.duration
    }
    // https://github.com/Project-OSRM/osrm-backend/blob/4ee9968e3b585ee8ef28aec4a7fe3cfdea1f9ea2/profiles/car.lua#L497
    if(junction.from.size > 1 || junction.to.size > 1) {
        if(Math.abs(turn.angle) > 110) { return undefined }
        duration += turnPenalty / (
            1 + Math.exp(-((13 / turnBias) * Math.abs(turn.angle)/180 - 6.5*turnBias))
        )
    }
    if(Math.abs(turn.angle) > 135) {
        duration += profile.properties.u_turn_penalty
    }
    if(!turn.fromEdge.way.restricted && turn.toEdge.way.restricted) {
        duration = 10_000 // Arbitrary large number
    }
    return duration
}