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
nnoremap <c-n> <cmd>nohlsearch<cr>      " clear search highlighting
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
nnoremap [b <cmd>bprevious<cr>          " previous buffer
nnoremap ]b <cmd>bnext<cr>              " next buffer
nnoremap <leader>x <cmd>bufdo bw<cr>    " close all buffers
 " close current buffer and switch to next
nnoremap <s-x> <cmd>try <bar> bn <bar> bd # <bar> catch <bar> enew <bar> endtry <cr>
nnoremap <leader>z `.                   " jump to last change position
" }}}

" window {{{
nnoremap <c-h> <c-w>h                   " move to left window
nnoremap <c-l> <c-w>l                   " move to right window
nnoremap <c-j> <c-w>j                   " move to window below
nnoremap <c-k> <c-w>k                   " move to window above
" }}}

" split {{{
set splitbelow                          " horizontal split puts new window below
set splitright                          " vertical split puts new window to the right
nnoremap <leader>\ <cmd>split<cr>       " horizontal split
nnoremap <leader>\| <cmd>vsplit<cr>     " vertical split
" }}}

" yank {{{
nnoremap Y "+y                          " yank to system clipboard
nnoremap YY "+yy                        " yank line to system clipboard
xnoremap Y "+y                          " visual mode yank to system clipboard
" }}}

" new line {{{
nnoremap o o<esc>                       " insert new line below, stay normal mode
nnoremap O O<esc>                       " insert new line above, stay normal mode
" }}}

" display move {{{
nnoremap j gj                           " move down by display line (for wrapped lines)
nnoremap k gk                           " move up by display line (for wrapped lines)
" }}}

" indent {{{
xnoremap < <gv                          " indent left and keep selection
xnoremap > >gv                          " indent right and keep selection
" }}}

" colorscheme {{{
if has('termguicolors')
    set termguicolors                   " enable true color support
endif
set background=dark                     " use dark background theme
colorscheme default                     " set colorscheme to default
" }}}

" terminal {{{
if exists("##TermOpen")
    autocmd TermOpen * setlocal nonumber    " hide line numbers in terminal
    autocmd TermOpen * startinsert          " enter insert mode when opening terminal
endif
" }}}

" vim: foldmethod=marker
