on escapeForJson(theString)
    set oldDelims to AppleScript's text item delimiters
    set AppleScript's text item delimiters to "\\"
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\\"
    set theString to parts as text
    set AppleScript's text item delimiters to "\""
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\""
    set theString to parts as text
    set AppleScript's text item delimiters to oldDelims
    return theString
end escapeForJson

tell application "Mail"
    try
        set msg to message id {{messageId}} of mailbox "{{mailboxName}}" of account "{{accountName}}"
        set flagged status of msg to {{flagged}}
        if {{flagIndex}} is not -1 then
            set flag index of msg to {{flagIndex}}
        end if
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
