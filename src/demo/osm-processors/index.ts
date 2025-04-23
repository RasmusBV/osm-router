export { processNode } from "./nodes.js"
export { processWay } from "./ways.js"
export { processTurn } from "./turns.js"

import * as OSM from "../../types.js"
import * as Utils from "../../utils.js"

export function filter(element: OSM.Element) {
    if(element.type !== "way") { 
        return true 
    }
    const highway = Utils.getTag(element, "highway")
    return highway !== undefined && highway !== ""
}