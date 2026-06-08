tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set allMessages to messages of theMailbox
        set totalCount to count of allMessages
        set limitNum to {{limit}} as integer
        set offsetNum to {{offset}} as integer

        -- Date filter setup
        set afterDate to missing value
        set beforeDate to missing value
        if "{{hasDateFilter}}" is "true" then
            set afterSecs to {{afterSeconds}} as integer
            set beforeSecs to {{beforeSeconds}} as integer
            if afterSecs is not 0 then set afterDate to (current date) - afterSecs
            if beforeSecs is not 0 then set beforeDate to (current date) - beforeSecs
        end if

        set resultList to ""

        if afterDate is missing value and beforeDate is missing value then
            -- Fast path: index-based pagination (no date filter)
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
        else
            -- Date-filtered path: iterate all, check bounds, apply offset + limit
            set matchCount to 0
            set skipped to 0
            repeat with i from 1 to totalCount
                if matchCount >= limitNum then exit repeat
                set msg to item i of allMessages
                set msgDateRcvd to date received of msg
                set passesDate to true
                if afterDate is not missing value and msgDateRcvd < afterDate then
                    set passesDate to false
                end if
                if beforeDate is not missing value and msgDateRcvd > beforeDate then
                    set passesDate to false
                end if
                if passesDate then
                    if skipped < offsetNum then
                        set skipped to skipped + 1
                    else
                        set msgId to id of msg
                        set msgSubject to my escapeForJson(subject of msg as text)
                        set msgSender to my escapeForJson(sender of msg as text)
                        set msgDate to msgDateRcvd as «class isot» as string
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
                        set matchCount to matchCount + 1
                    end if
                end if
            end repeat
        end if

        return "[" & resultList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
