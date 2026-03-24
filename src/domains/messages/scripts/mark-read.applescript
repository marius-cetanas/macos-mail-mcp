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
        set read status of msg to {{read}}
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
