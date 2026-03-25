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
        set theAccount to account "{{accountName}}"
        set theMailbox to mailbox "{{mailboxName}}" of theAccount
        set allMessages to messages of theMailbox
        set totalCount to count of allMessages
        set limitNum to {{limit}} as integer
        set offsetNum to {{offset}} as integer

        set resultList to ""
        set endIndex to offsetNum + limitNum
        if endIndex > totalCount then set endIndex to totalCount

        repeat with i from (offsetNum + 1) to endIndex
            set msg to item i of allMessages
            set msgId to id of msg
            set msgSubject to my escapeForJson(subject of msg as text)
            set msgSender to my escapeForJson(sender of msg as text)
            set msgDate to date received of msg as «class isot» as string
            set msgRead to read status of msg
            set msgFlagged to flagged status of msg
            set msgFlagIndex to flag index of msg
            set msgHasAttach to (count of mail attachments of msg) > 0

            if resultList is not "" then set resultList to resultList & ", "
            set resultList to resultList & "{"
            set resultList to resultList & "\"id\": " & msgId & ", "
            set resultList to resultList & "\"subject\": \"" & msgSubject & "\", "
            set resultList to resultList & "\"sender\": \"" & msgSender & "\", "
            set resultList to resultList & "\"dateReceived\": \"" & msgDate & "\", "
            set resultList to resultList & "\"readStatus\": " & msgRead & ", "
            set resultList to resultList & "\"flagged\": " & msgFlagged & ", "
            set resultList to resultList & "\"flagIndex\": " & msgFlagIndex & ", "
            set resultList to resultList & "\"hasAttachments\": " & msgHasAttach
            set resultList to resultList & "}"
        end repeat

        return "[" & resultList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
