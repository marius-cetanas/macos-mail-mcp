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
            set msgSubject to my escapeQuotes(subject of msg as text)
            set msgSender to my escapeQuotes(sender of msg as text)
            set msgDate to date received of msg as «class isot» as string
            set msgRead to read status of msg
            set msgFlagged to flagged status of msg
            set msgFlagIndex to flag index of msg
            set msgHasAttach to has attachment of msg

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
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
