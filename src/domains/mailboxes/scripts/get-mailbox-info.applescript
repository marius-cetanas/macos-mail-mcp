tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set mbox to mailbox "{{mailboxName}}" of acct
        set mboxName to my escapeForJson(name of mbox)
        set acctName to my escapeForJson(name of acct)
        set mboxUnread to unread count of mbox
        set mboxCount to count of messages of mbox
        set containerJson to "null"
        try
            set parentContainer to container of mbox
            set containerJson to "\"" & my escapeForJson(name of parentContainer) & "\""
        end try
        return "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"" & acctName & "\", \"messageCount\": " & mboxCount & ", \"container\": " & containerJson & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
