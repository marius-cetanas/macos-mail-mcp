on escapeQuotes(theString)
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        if c is "\"" then
            set resultStr to resultStr & "\\\""
        else if c is "\\" then
            set resultStr to resultStr & "\\\\"
        else
            set resultStr to resultStr & c
        end if
    end repeat
    return resultStr
end escapeQuotes

tell application "Mail"
    try
        set mailboxList to ""
        if "{{accountName}}" is "__ALL__" then
            set allAccounts to every account
            repeat with acct in allAccounts
                set acctName to my escapeQuotes(name of acct)
                set allMailboxes to every mailbox of acct
                repeat with mbox in allMailboxes
                    set mboxName to my escapeQuotes(name of mbox)
                    set mboxUnread to unread count of mbox
                    if mailboxList is not "" then set mailboxList to mailboxList & ", "
                    set mailboxList to mailboxList & "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"" & acctName & "\"}"
                end repeat
            end repeat
        else
            set acct to account "{{accountName}}"
            set acctName to my escapeQuotes(name of acct)
            set allMailboxes to every mailbox of acct
            repeat with mbox in allMailboxes
                set mboxName to my escapeQuotes(name of mbox)
                set mboxUnread to unread count of mbox
                if mailboxList is not "" then set mailboxList to mailboxList & ", "
                set mailboxList to mailboxList & "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"" & acctName & "\"}"
            end repeat
        end if
        return "[" & mailboxList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
