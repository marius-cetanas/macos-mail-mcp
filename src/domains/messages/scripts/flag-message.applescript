tell application "Mail"
    try
        set msg to first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}}
        set flagged status of msg to {{flagged}}
        set flag index of msg to {{flagIndex}}
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
