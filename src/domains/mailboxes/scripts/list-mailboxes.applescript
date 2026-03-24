on escapeForJson(theString)
    -- Use text item delimiters for O(n) performance instead of character-by-character O(n²)
    set oldDelims to AppleScript's text item delimiters

    -- Escape backslashes first
    set AppleScript's text item delimiters to "\\"
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\\"
    set theString to parts as text

    -- Escape double quotes
    set AppleScript's text item delimiters to "\""
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\""
    set theString to parts as text

    -- Escape tabs (ASCII 9)
    set AppleScript's text item delimiters to (ASCII character 9)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\t"
    set theString to parts as text

    -- Escape newlines (ASCII 10)
    set AppleScript's text item delimiters to (ASCII character 10)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\n"
    set theString to parts as text

    -- Escape carriage returns (ASCII 13)
    set AppleScript's text item delimiters to (ASCII character 13)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\r"
    set theString to parts as text

    -- Escape other C0 control characters (0-8, 11-12, 14-31)
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        set cCode to id of c
        if cCode >= 0 and cCode <= 31 then
            set hexChars to "0123456789abcdef"
            set hi to (cCode div 16) + 1
            set lo to (cCode mod 16) + 1
            set resultStr to resultStr & "\\u00" & character hi of hexChars & character lo of hexChars
        else
            set resultStr to resultStr & c
        end if
    end repeat

    set AppleScript's text item delimiters to oldDelims
    return resultStr
end escapeForJson

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
