on dateToUtcIso(receivedValue)
    if class of receivedValue is not date then error "Expected a Mail date for dateReceived."
    tell me to set runtimeZone to system attribute "TZ"
    if runtimeZone is not "UTC" then error "dateReceived requires a UTC subprocess."
    return (receivedValue as «class isot» as string) & "Z"
end dateToUtcIso
