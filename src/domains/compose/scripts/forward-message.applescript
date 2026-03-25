set bodyContent to ""
if "{{bodyFile}}" is not "__NONE__" then
    set bodyContent to do shell script "cat " & quoted form of "{{bodyFile}}"
end if

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to (first message of theMailbox whose id is {{messageId}})
        set fwdMsg to forward msg without opening window
        tell fwdMsg
            make new to recipient with properties {address:"{{to}}"}
            if bodyContent is not "" then
                set content to bodyContent & (ASCII character 10) & (ASCII character 10) & content
            end if
            send
        end tell
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
