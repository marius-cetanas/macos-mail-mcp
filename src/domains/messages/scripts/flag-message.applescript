tell application "Mail"
    try
        set msg to message id {{messageId}} of mailbox "{{mailboxName}}" of account "{{accountName}}"
        set flagged status of msg to {{flagged}}
        if {{flagIndex}} is not -1 then
            set flag index of msg to {{flagIndex}}
        end if
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
