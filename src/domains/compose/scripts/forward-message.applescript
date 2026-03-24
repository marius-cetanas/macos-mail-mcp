tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to first message of theMailbox whose id is {{messageId}}
        set fwdMsg to forward msg without opening window
        tell fwdMsg
            make new to recipient with properties {address:"{{to}}"}
            if "{{body}}" is not "__NONE__" then
                set content to "{{body}}" & return & return & content
            end if
            send
        end tell
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
