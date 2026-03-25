tell application "Mail"
    try
        set msg to (first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}})
        set read status of msg to {{read}}
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
