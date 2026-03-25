tell application "Mail"
    try
        set msg to (first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}})
        delete msg
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
