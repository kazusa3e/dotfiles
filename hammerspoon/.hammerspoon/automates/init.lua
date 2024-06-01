local function runTask(path, arguments, stdout, stderr)
    local _stdout = ''
    local _stderr = ''
    if type(stdout) == 'string' then
        _stdout = stdout
    elseif type(stdout) == 'function' then
        _stdout = tostring(stdout())
    else
        _stdout = ''
    end
    if type(stderr) == 'string' then
        _stderr = stderr
    elseif type(stderr) == 'function' then
        _stderr = tostring(stderr())
    else
        _stderr = ''
    end

    local function openFile(path)
        -- Extract directory path from the file path
        local dir = path:match('(.*/)')

        -- If directory path exists, create the directory
        if dir then
            -- print('Creating directory: ' .. dir)
            os.execute('mkdir -p ' .. dir)
        end

        -- Open the file
        local file, err = io.open(path, 'a')

        -- If the file couldn't be opened, raise an error
        if not file then
            error('Could not open file: ' .. err)
        end

        return file
    end

    local outfile = openFile(_stdout);
    local errfile = openFile(_stderr);

    hs.task.new(
        path,
        function(exitCode, stdoutContent, stderrContent)
            outfile:close()
            errfile:close()
        end,
        function(task, stdoutContent, stderrContent)
            outfile:write(stdoutContent)
            errfile:write(stderrContent)
            return true
        end,
        arguments
    ):start()
end

local function composeLogPath(category, type)
    return '/var/log/' .. category .. '/' .. os.date('%Y%m%d') .. '.' .. type .. '.log'
end

Automates = {}
function Automates.runTask(path, arguments, stdout, stderr)
    runTask(path, arguments, stdout, stderr)
end

function Automates.composeLogPath(category, type)
    return composeLogPath(category, type)
end

return Automates
