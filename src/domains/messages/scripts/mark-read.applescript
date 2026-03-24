tell application "Mail"
    try
        set msg to message id {{messageId}} of mailbox "{{mailboxName}}" of account "{{accountName}}"
        set read status of msg to {{read}}
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
