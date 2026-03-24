tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to message id {{messageId}} of theMailbox
        if "{{replyAll}}" is "true" then
            set replyMsg to reply msg reply to all yes without opening window
        else
            set replyMsg to reply msg without opening window
        end if
        tell replyMsg
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
