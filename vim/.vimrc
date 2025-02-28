" basic {{{
set nocompatible
set hidden
set modeline
set modelines=1
set number
set backspace=indent,eol,start
filetype plugin indent on
syntax on
set encoding=utf-8
set noswapfile
set undofile
set undodir=$HOME/.vim/undo
set cursorline
set autoread
set updatetime=500
set scrolloff=5
let mapleader=' '
set mouse=
autocmd FileType * set formatoptions-=cro
set signcolumn=number
set sessionoptions+=tabpages,globals
set nrformats+=alpha
set ttimeoutlen=5
" }}}

" indent {{{
set tabstop=4
set shiftwidth=0
set expandtab
set autoindent
set smartindent
set textwidth=80
set wrap
" }}}

" search {{{
set ignorecase
set smartcase
set incsearch
set hlsearch
nnoremap <c-n> <cmd>nohlsearch<cr>
"}}}

" fold {{{
set foldlevel=99
set foldcolumn=0
function! NextNonBlankLine(lnum)
    let numlines = line('$')
    let current = a:lnum + 1
    while current <= numlines
        if getline(current) =~? '\v\S'
            return current
        endif
        let current += 1
    endwhile
    return -2
endfunction
function! IndentLevel(lnum)
    return indent(a:lnum) / &shiftwidth
endfunction
function! GetPotionFold(lnum)
    if getline(a:lnum) =~? '\v^\s*$'
        return '-1'
    endif
    let this_indent = IndentLevel(a:lnum)
    let next_indent = IndentLevel(NextNonBlankLine(a:lnum))
    if next_indent == this_indent
        return this_indent
    elseif next_indent < this_indent
        return this_indent
    elseif next_indent > this_indent
        return '>' . next_indent
    endif
endfunction
set foldexpr=GetPotionFold(v:lnum)
set foldmethod=expr
" }}}

" markdown {{{
autocmd FileType markdown setlocal conceallevel=2
" autocmd FileType markdown setlocal textwidth=0
" autocmd FileType markdown setlocal spell
" autocmd FileType markdown setlocal nowrap
" autocmd FileType markdown setlocal foldmethod=expr
" autocmd FileType markdown setlocal foldexpr=GetPotionFold(v:lnum)
" nnoremap <leader>nn <cmd>e $HOME/todo.md<cr>
" }}}

" disable keybindings {{{
nnoremap s <nop>
nnoremap S <nop>
nnoremap a <nop>
nnoremap m <nop>
nnoremap M <nop>
nnoremap q <nop>
nnoremap Q <nop>
xnoremap q <nop>
xnoremap Q <nop>
nnoremap m q
nnoremap M Q
xnoremap s <nop>
xnoremap S <nop>
nnoremap <F1> <nop>
" }}}

" buffer {{{
" TODO: recent buffer
" nnoremap <c-e> <cmd>bprevious<cr>
nnoremap [b <cmd>bprevious<cr>
nnoremap ]b <cmd>bnext<cr>
nnoremap <leader>N <cmd>enew<cr>
nnoremap <leader>x <cmd>bufdo bw<cr>
nnoremap <s-x> <cmd>bd<cr>
nnoremap <leader>z `.
" }}}

" window {{{
nnoremap <c-h> <c-w>h
nnoremap <c-l> <c-w>l
nnoremap <c-j> <c-w>j
nnoremap <c-k> <c-w>k

inoremap <c-h> <esc><c-w>h
inoremap <c-l> <esc><c-w>l
inoremap <c-j> <esc><c-w>j
inoremap <c-k> <esc><c-w>k
" }}}

" quickfix {{{
" nnoremap [q <cmd>cp<cr>
" nnoremap ]q <cmd>cn<cr>
" nnoremap qf <cmd>cw<cr>
" }}}

" tab {{{
nnoremap <leader>hn <cmd>tabnew<cr>
nnoremap <leader>he <cmd>tabnext<cr>
nnoremap <leader>hx <cmd>tabclose<cr>

tnoremap <leader>hn <cmd>tabnew<cr>
tnoremap <leader>he <cmd>tabnext<cr>
tnoremap <leader>hx <cmd>tabclose<cr>
" }}}

" split {{{
set splitbelow
set splitright
nnoremap <leader>\ <cmd>split<cr>
nnoremap <leader>\| <cmd>vsplit<cr>
" }}}

" yank {{{
nnoremap Y "+yy
xnoremap Y "+y
" }}}

" new line {{{
nnoremap o o<esc>
nnoremap O O<esc>
" }}}

" quick move {{{
nnoremap J 5j
nnoremap K 5k
nnoremap H 5h
nnoremap L 5l
" }}}

" indent {{{
xnoremap < <gv
xnoremap > >gv
" }}}

" line object {{{
xnoremap il g_o^
onoremap il :normal vil<CR>
xnoremap al $o0
onoremap al :normal val<CR>
" }}}

" neovide {{{
if exists("g:neovide")
    set guifont=Comic\ Mono:h12
    set linespace=4
    let g:neovide_cursor_vfx_mode = "torpedo"
endif
" }}}

" colorscheme {{{
set background=light
" }}}

" utils {{{
" function! T2to4()
"     setlocal ts=2 sts=2 noet | retab! | setlocal ts=4 sts=4 et | retab!
" endfunction
" }}}




nnoremap j gj
nnoremap k gk

inoremap <C-e> <esc>A
inoremap <C-a> <esc>I

command DiffOrig vert new | set buftype=nofile | read ++edit # | 0d_ | diffthis | wincmd p | diffthis
nnoremap <leader>gds <cmd>DiffOrig<cr>

xnoremap <silent> s y/<C-R>=escape(@", '/\')<CR><CR>

nnoremap <leader>Y <cmd>%y+<cr>

" vim: foldmethod=marker
