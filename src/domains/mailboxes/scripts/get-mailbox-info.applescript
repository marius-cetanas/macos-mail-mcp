tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set mbox to mailbox "{{mailboxName}}" of acct
        set mboxName to name of mbox
        set mboxUnread to unread count of mbox
        set mboxCount to count of messages of mbox
        set containerJson to "null"
        try
            set parentContainer to container of mbox
            set containerJson to "\"" & name of parentContainer & "\""
        end try
        return "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"{{accountName}}\", \"messageCount\": " & mboxCount & ", \"container\": " & containerJson & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
