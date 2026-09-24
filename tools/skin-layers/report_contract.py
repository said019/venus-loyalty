"""Public result contract; detector counts are not confirmed findings."""

def build_report(raw, modalities):
    allowed = {"blanca", "polarizada", "uv", "wood"}
    if "blanca" not in modalities or not set(modalities) <= allowed:
        raise ValueError("Invalid capture modalities")
    layers = {}
    for key, value in raw.items():
        entry = {"reviewRequired": True, "confirmedCount": None}
        count = value.get("conteo")
        if count is not None:
            if type(count) is not int or count < 0:
                raise ValueError("Invalid candidate count")
            entry["candidateCount"] = count
        if "por_zona" in value:
            entry["candidatesByZone"] = value["por_zona"]
        layers[key] = entry
    return {"schemaVersion": 1, "method": "venus-classical-cv-v1",
            "validated": False, "modalities": sorted(modalities),
            "layers": layers, "score": None,
            "unavailableModalities": sorted(allowed - set(modalities))}
