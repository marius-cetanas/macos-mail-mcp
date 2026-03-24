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
        set acct to account "{{accountName}}"
        set mbox to mailbox "{{mailboxName}}" of acct
        set mboxName to my escapeQuotes(name of mbox)
        set acctName to my escapeQuotes(name of acct)
        set mboxUnread to unread count of mbox
        set mboxCount to count of messages of mbox
        set containerJson to "null"
        try
            set parentContainer to container of mbox
            set containerJson to "\"" & my escapeQuotes(name of parentContainer) & "\""
        end try
        return "{\"name\": \"" & mboxName & "\", \"unreadCount\": " & mboxUnread & ", \"accountName\": \"" & acctName & "\", \"messageCount\": " & mboxCount & ", \"container\": " & containerJson & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
