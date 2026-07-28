" basic {{{
set nocompatible                        " disable vi-compatibility mode
set hidden                              " allow hiding unsaved buffers
set number                              " show line numbers
set backspace=indent,eol,start          " allow backspace over indent/eol/start
filetype plugin indent on               " enable filetype detection, plugins & indent
syntax on                               " enable syntax highlighting
set encoding=utf-8                      " set internal encoding to UTF-8
set noswapfile                          " disable swap files
set undofile                            " enable persistent undo
set undodir=$HOME/.vim/undo             " directory for undo files
set cursorline                          " highlight the current line
set autoread                            " auto-reload externally changed files
set updatetime=500                      " trigger swap write / CursorHold after 500ms
set scrolloff=5                         " keep 5 lines visible around cursor
let mapleader=' '                       " set leader key to space
set mouse=a                             " enable mouse in all modes
set signcolumn=number                   " merge sign column with line number
set sessionoptions+=tabpages,globals    " save tab pages and globals in sessions
set nrformats+=alpha                    " allow <C-a>/<C-x> on letters
" set modeline                            " enable mode lines in files
" set modelines=1                         " scan first/last 1 line for mode lines
" set exrc                                " allow per-directory .vimrc / .exrc
" }}}

" indent {{{
set expandtab                           " use spaces instead of tabs
set autoindent                          " copy indent from current line
set smartindent                         " smart auto-indent for C-like syntax
set infercase                          " case-insensitive completion, respect case of typed word

set tabstop=4                           " display tabs as 4 spaces
set shiftwidth=0                        " use tabstop value for shifting
set textwidth=0                         " disable automatic hard wrapping
set softtabstop=-1                      " follow shiftwidth/tabstop behavior
" set wrap                                " wrap long lines visually
" }}}

" search {{{
set ignorecase                          " case-insensitive search
set smartcase                           " case-sensitive if uppercase present
set incsearch                           " incremental search (live highlighting)
set hlsearch                            " highlight all search matches
" clear search highlighting
nnoremap <c-n> <cmd>nohlsearch<cr>
" }}}

" disable keybindings {{{

" defined in neovim

" disable s (surround)
nnoremap s <nop>
nnoremap S <nop>
xnoremap s <nop>
xnoremap S <nop>

" disable q (comment)
" use `Q` to record macros instead of `q`
nnoremap Q q
xnoremap Q q
nnoremap q <nop>
xnoremap q <nop>
" }}}

" buffer {{{
" previous buffer
nnoremap [b <cmd>bprevious<cr>
" next buffer
nnoremap ]b <cmd>bnext<cr>
" close all buffers
nnoremap <leader>x <cmd>bufdo bw<cr>
" close current buffer and switch to next
nnoremap <s-x> <cmd>try <bar> bn <bar> bd # <bar> catch <bar> enew <bar> endtry <cr>
" jump to last change position
nnoremap <leader>a `.
" }}}

" window {{{
" move to left window
nnoremap <c-h> <c-w>h
" move to right window
nnoremap <c-l> <c-w>l
" move to window below
nnoremap <c-j> <c-w>j
" move to window above
nnoremap <c-k> <c-w>k
" }}}

" split {{{
set splitbelow                          " horizontal split puts new window below
set splitright                          " vertical split puts new window to the right
" horizontal split
nnoremap <leader>\ <cmd>split<cr>
" vertical split
noremap <leader>\| <cmd>vsplit<cr>
" }}}

" yank {{{
" yank to system clipboard
nnoremap Y "+y
" yank line to system clipboard
nnoremap YY "+yy
" visual mode yank to system clipboard
xnoremap Y "+y
" }}}

" new line {{{
" insert new line below, stay normal mode
nnoremap o o<esc>
" insert new line above, stay normal mode
nnoremap O O<esc>
" }}}

" display move {{{
" nnoremap j gj                           " move down by display line (for wrapped lines)
" nnoremap k gk                           " move up by display line (for wrapped lines)
" }}}

" indent {{{
" indent left and keep selection
xnoremap < <gv
" indent right and keep selection
xnoremap > >gv
" }}}

" completion & fold & formatoptions {{{

" complete: sources for insert-mode completion
"   .  = current buffer
"   w  = buffers from other windows (^5 = scan up to 5)
"   b  = other loaded buffers (^5)
"   u  = unloaded buffers (^5)
"   t  = tags
"   i  = current / included files
set complete=.,w^5,b^5,u^5,t,i

" completeopt: behaviour of the completion popup menu
"   menuone   = always show popup even for single match
"   popup     = show preview info in a popup window (Neovim)
"   preview   = show preview in the preview window
"   preinsert = auto-select first match without <CR>
set completeopt=menuone,popup,preview,preinsert

" autocomplete: enables automatic keyword/completion suggestions while typing
set autocomplete

" <Tab> in insert mode: accept the selected completion if popup
" is visible, otherwise insert a literal tab
inoremap <expr> <tab> pumvisible() ? "\<c-y>" : "\<tab>"

" Folds: keep disabled by default (Neovim sets tree-sitter foldexpr
" separately; Vim defaults to manual folding, which is also off).
set nofoldenable

" disable automatic comment continuation: r(Enter)/o(oO)/c(auto-wrap)
set formatoptions-=cro

" filetype plugins often re-set formatoptions, reapply on each FileType
autocmd FileType * set formatoptions-=cro
" }}}

" colorscheme {{{
if has('termguicolors')
    set termguicolors                   " enable true color support
endif
colorscheme default                     " set colorscheme to default
set background=dark                     " use dark background theme

autocmd VimEnter * highlight Normal guibg=NONE
if has('nvim')
  autocmd VimEnter * highlight NormalFloat guibg=NONE
endif
" }}}

" terminal {{{
if exists("##TermOpen")
    autocmd TermOpen * setlocal nonumber    " hide line numbers in terminal
    autocmd TermOpen * startinsert          " enter insert mode when opening terminal
endif
" }}}

" restore cursor position {{{
autocmd BufReadPost *
  \ if line("'\"") > 0 && line("'\"") <= line("$") |
  \   execute "normal! g`\"" |
  \ endif
" }}}

" vim: foldmethod=marker
