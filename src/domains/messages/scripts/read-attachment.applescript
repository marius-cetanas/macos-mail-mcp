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

set saveSucceeded to false
set tempPath to ""
set tempDir to ""

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to message id {{messageId}} of theMailbox

        set targetAttachment to missing value
        repeat with att in mail attachments of msg
            if name of att as text is "{{attachmentName}}" then
                set targetAttachment to att
                exit repeat
            end if
        end repeat

        if targetAttachment is missing value then
            return "{\"error\": \"Attachment not found\", \"errorNumber\": -1}"
        end if

        if downloaded of targetAttachment is false then
            return "{\"error\": \"Attachment is not yet downloaded. Open the message in Mail.app first.\", \"errorNumber\": -2}"
        end if

        set attName to name of targetAttachment as text
        set tempDir to do shell script "mktemp -d"
        set tempPath to tempDir & "/" & attName
        save targetAttachment in POSIX file tempPath
        set saveSucceeded to true
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell

if saveSucceeded then
    try
        set fileContent to do shell script "cat " & quoted form of tempPath
        set escapedName to my escapeForJson("{{attachmentName}}")
        set escapedContent to my escapeForJson(fileContent)
        do shell script "rm -rf " & quoted form of tempDir
        return "{\"name\": \"" & escapedName & "\", \"content\": \"" & escapedContent & "\"}"
    on error errMsg number errNum
        try
            do shell script "rm -rf " & quoted form of tempDir
        end try
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end if
