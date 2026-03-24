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

set bodyContent to ""
if "{{bodyFile}}" is not "__NONE__" then
    set bodyContent to do shell script "cat " & quoted form of "{{bodyFile}}"
end if

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to message id {{messageId}} of theMailbox
        set fwdMsg to forward msg without opening window
        tell fwdMsg
            make new to recipient with properties {address:"{{to}}"}
            if bodyContent is not "" then
                set content to bodyContent & return & return & content
            end if
            send
        end tell
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
