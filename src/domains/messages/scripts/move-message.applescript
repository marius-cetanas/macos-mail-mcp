tell application "Mail"
    try
        set srcMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to (first message of srcMailbox whose id is {{messageId}})
        set mailbox of msg to (my resolveMailbox("{{accountName}}", "{{toMailbox}}"))
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
