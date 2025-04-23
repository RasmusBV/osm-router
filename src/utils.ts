import * as Types from "./types.js"

export const getTag = (item: Types.Element, key: string) => {
    return item.tags ? item.tags[key] : undefined
}

export const tagValueLookup = <T extends Record<string, any>>(item: Types.Element, key: string, record: T): (T[keyof T] | undefined) => {
    const tagValue = getTag(item, key)
    if(!tagValue) { return undefined }
    const recordValue = record[tagValue]
    return recordValue
}

export const getForwardBackward = (item: Types.Element, key: string): [string | undefined, string | undefined] => {
    let forward = getTag(item, key + ":forward")
    let backward = getTag(item, key + ":backward")
    if(!forward || !backward) {
        const common = getTag(item, key)
        if(getTag(item, "is_forward_oneway")) {
            forward = forward ?? common
        } else if(getTag(item, "is_reverse_oneway")) {
            backward = backward ?? common
        } else {
            forward = forward ?? common
            backward = backward ?? common
        }
    }
    return [forward, backward]
}

export const getForwardBackwardArray = (item: Types.Element, keys: Iterable<string>): [string | undefined, string | undefined] => {
    let forward: string | undefined = undefined
    let backward: string | undefined = undefined
    for(const key of keys) {
        if(!forward) {
            forward = getTag(item, key + ":forward")
        }
        if(!backward) {
            backward = getTag(item, key + ":backward")
        }
        if(!forward || !backward) {
            const common = getTag(item, key)
            forward = forward ?? common
            backward = backward ?? common
        }
        if(forward && backward) { break }
    }
    return [forward, backward]
}

export const prefixValue = (item: Types.Element, values: Iterable<string>, prefix: string) => {
    for(const value of values) {
        const tagValue = getTag(item, prefix + ":" + value)
        if(tagValue) { return tagValue }
    }
}

export const postfixValue = (item: Types.Element, values: Iterable<string>, postfix: string) => {
    for(const value of values) {
        const tagValue = getTag(item, value + ":" + postfix)
        if(tagValue) { return tagValue }
    }
}

const unitToKmph: Record<string, number> = {
    "mph": 1.609,
    "mp/h": 1.609
}

export const kmphToMs = (10/36)

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