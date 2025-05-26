import * as Types from "./types.js"

/**
 * Lookup the value of a tag in a seperate object
 * @param element The OSM element which contains the tag to check.
 * @param key The tag to check.
 * @param record An object with keys corresponding to potential tag values
 * 
 */
export const tagValueLookup = <T extends Record<string, any>>(element: Types.Element, key: string, record: T): (T[keyof T] | undefined) => {
    const tagValue = element.tags?.[key]
    if(!tagValue) { return undefined }
    const recordValue = record[tagValue]
    return recordValue
}

/**
 * Lookup tags postfixed with **:forward** and **:backward**, fill in blanks non-postfixed tag.
 * @param way The OSM way for which to check for tags
 * @param key The tag to check
 * @returns `[forward, backward]`
 */
export const getForwardBackward = (way: Types.Way, key: string): [string | undefined, string | undefined] => {
    let forward = way.tags?.[key + ":forward"]
    let backward = way.tags?.[key + "backward"]
    if(!forward || !backward) {
        const common = way.tags?.[key]
        if(way.tags?.is_forward_oneway) {
            forward = forward ?? common
        } else if(way.tags?.is_reverse_oneway) {
            backward = backward ?? common
        } else {
            forward = forward ?? common
            backward = backward ?? common
        }
    }
    return [forward, backward]
}
/**
 * Lookup tags postfixed with **:forward** and **:backward**, fill in blanks non-postfixed tag.
 * @param way The OSM way for which to check for tags
 * @param keys The tags to check
 * @returns `[forward, backward]`
 * 
 * This function will check all keys in the order they are provided, and return the first non-undefined value for forward and backward.
 */
export const getForwardBackwardArray = (way: Types.Way, keys: Iterable<string>): [string | undefined, string | undefined] => {
    let forward: string | undefined = undefined
    let backward: string | undefined = undefined
    for(const key of keys) {
        if(!forward) {
            forward = way.tags?.[key + ":forward"]
        }
        if(!backward) {
            backward = way.tags?.[key + "backward"]
        }
        if(!forward || !backward) {
            const common = way.tags?.[key]
            forward = forward ?? common
            backward = backward ?? common
        }
        if(forward && backward) { break }
    }
    return [forward, backward]
}

/**
 * Lookup tags in a list of values, prefixed with a given prefix.
 * @param element The OSM element which contains the tag to check.
 * @param values The list of values to check for.
 * @param prefix The prefix to use for the tag.
 * 
 * This function will check all values in the order they are provided, and return the first non-undefined value.
 */
export const prefixValue = (element: Types.Element, values: Iterable<string>, prefix: string) => {
    for(const value of values) {
        const tagValue = element.tags?.[prefix + ":" + value]
        if(tagValue) { return tagValue }
    }
}


/**
 * Lookup tags in a list of values, postfixed with a given postfix.
 * @param element The OSM element which contains the tag to check.
 * @param values The list of values to check for.
 * @param postfix The postfix to use for the tag.
 * 
 * This function will check all values in the order they are provided, and return the first non-undefined value.
 */
export const postfixValue = (element: Types.Element, values: Iterable<string>, postfix: string) => {
    for(const value of values) {
        const tagValue = element.tags?.[value + ":" + postfix]
        if(tagValue) { return tagValue }
    }
}

const unitToKmph: Record<string, number> = {
    "mph": 1.609,
    "mp/h": 1.609
}

export const kmphToMs = (10/36)

/**
 * Convert a string to meters per second
 * @param val The value to convert, can be a string or undefined
 * @returns The value in meters per second, or undefined if the value could not be parsed
 */
export const convertToMetersPerSecond = (val: string | undefined ) => {
    if(val === undefined) { return undefined }
    let amount = parseFloat(val)
    if(isNaN(amount)) { return undefined }
    for(const unit in unitToKmph) {
        if(val.match(unit)) {
            amount *= unitToKmph[unit]
            break
        }
    }
    return amount * kmphToMs
}

const parseFeetAndInches = (string: string) => {
    const parsed = string.match(/(?:(\d*)')?(?:(\d*)")?/)
    if(!parsed) { return undefined }
    const [_, feet, inches] = parsed.map(parseInt)
    let meters = 0
    if(!isNaN(feet)) { meters += 0.3048*feet }
    if(!isNaN(inches)) { meters += 0.0254*inches }
    if(meters === 0) { return undefined }
    return meters
}

const lengthConvertions: Record<string, number> = {
    "km": 1_000,
    "mi": 1_609.344
}

/**
 * Parse a string containing some length value, and convert it to meters
 * @param val The value to convert, can be a string or undefined
 * @returns The value in meters, or undefined if the value could not be parsed
 */
export const convertToMeters = (val: string | undefined) => {
    if(!val) { return undefined }
    const feetAndInches = parseFeetAndInches(val)
    if(feetAndInches) { return feetAndInches }
    let amount = parseFloat(val)
    if(isNaN(amount)) { return undefined }
    for(const unit in lengthConvertions) {
        if(val.match(unit)) {
            amount *= unitToKmph[unit]
            break
        }
    }
    return amount
}