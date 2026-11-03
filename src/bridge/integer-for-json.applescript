-- Build ASCII decimal digits directly; numeric text coercion is locale-dependent.
on integerForJson(value)
    set numericValue to contents of value
    set numberClass to class of numericValue
    if numberClass is not integer and numberClass is not real then error "Expected a safe integer for JSON."
    if numericValue < -9007199254740991 or numericValue > 9007199254740991 then error "Expected a safe integer for JSON."
    if (numericValue mod 1) is not 0 then error "Expected a safe integer for JSON."
    if numericValue is 0 then return "0"

    set signText to ""
    if numericValue < 0 then
        set signText to "-"
        set numericValue to -numericValue
    end if
    set encodedText to ""
    repeat while numericValue > 0
        set remainderValue to numericValue mod 10
        set encodedText to (character ((remainderValue as integer) + 1) of "0123456789") & encodedText
        set numericValue to (numericValue - remainderValue) / 10
    end repeat
    return signText & encodedText
end integerForJson
