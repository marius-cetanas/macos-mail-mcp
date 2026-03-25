tell application "Mail"
    try
        set mailboxList to ""
        if "{{accountName}}" is "__ALL__" then
            set allAccounts to every account
            repeat with acct in allAccounts
                set acctName to my escapeForJson(name of acct)
                set allMailboxes to every mailbox of acct
                repeat with mbox in allMailboxes
                    set mboxName to my escapeForJson(name of mbox)
                    set mboxUnread to unread count of mbox
                    if mailboxList is not "" then set mailboxList to mailboxList & ", "
                    set mailboxList to mailboxList & "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"" & acctName & "\"}"
                end repeat
            end repeat
        else
            set acct to account "{{accountName}}"
            set acctName to my escapeForJson(name of acct)
            set allMailboxes to every mailbox of acct
            repeat with mbox in allMailboxes
                set mboxName to my escapeForJson(name of mbox)
                set mboxUnread to unread count of mbox
                if mailboxList is not "" then set mailboxList to mailboxList & ", "
                set mailboxList to mailboxList & "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"" & acctName & "\"}"
            end repeat
        end if
        return "[" & mailboxList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
