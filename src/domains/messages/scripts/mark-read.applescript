tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to my requireMessage(theMailbox, {{messageId}}, "{{accountName}}", "{{mailboxName}}")
        set read status of msg to {{read}}
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
