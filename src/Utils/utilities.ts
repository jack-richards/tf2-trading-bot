const addToMapArray = (key: string, value: string, map: Map<string, string[]>) => {
    if (!map.has(key)) {
        map.set(key, []);
    }
    map.get(key)?.push(value);
    return map;
}

export default addToMapArray;