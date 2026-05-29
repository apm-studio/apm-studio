import type { ChatTodo } from '../../../shared/chat-contracts'
import { useStudioStore } from '../../store'
import { BasicTool, ToolErrorCard } from './ToolGroupPrimitives'
import type { ToolRowProps } from './ToolRowTypes'
import { formatToolDuration } from './tool-group-utils'

type TodoListItem = { content: string; status: string }

function toTodoListItem(value: unknown): TodoListItem {
    if (value && typeof value === 'object') {
        const r = value as Record<string, unknown>
        return {
            content: typeof r.content === 'string' ? r.content : typeof r.title === 'string' ? r.title : String(value),
            status: typeof r.status === 'string' ? r.status : 'pending',
        }
    }
    return { content: String(value), status: 'pending' }
}

function TodoInlineList({ input, output }: { input?: Record<string, unknown>; output?: string }) {
    let items: TodoListItem[] = []
    if (output) {
        try {
            const parsed = JSON.parse(output)
            if (Array.isArray(parsed)) items = parsed.map(toTodoListItem)
        } catch {
            items = output.split('\n').filter(Boolean).map(line => ({ content: line, status: 'pending' }))
        }
    }
    const sessionTodos = useStudioStore.getState().seTodos
    if (items.length === 0) {
        const allTodos: ChatTodo[] = Object.values(sessionTodos).flat()
        if (allTodos.length > 0) items = allTodos.map(t => ({ content: t.content, status: t.status }))
    }
    if (items.length === 0 && input) {
        return <pre className="tool-pre tool-pre--panel">{JSON.stringify(input, null, 2)}</pre>
    }

    const iconFor = (s: string) => {
        if (s === 'completed') return <span className="todo-inline-status todo-inline-status--completed">DONE</span>
        if (s === 'in_progress') return <span className="todo-inline-status todo-inline-status--active">WORK</span>
        if (s === 'cancelled') return <span className="todo-inline-status todo-inline-status--cancelled">STOP</span>
        return <span className="todo-inline-status">TODO</span>
    }

    return (
        <div className="todo-inline-list">
            {items.map((item, i) => (
                <div key={i} className={`todo-inline-item ${item.status === 'in_progress' ? 'todo-inline-item--active' : ''} ${item.status === 'completed' || item.status === 'cancelled' ? 'todo-inline-item--done' : ''}`}>
                    {iconFor(item.status)}
                    <span className={item.status === 'completed' || item.status === 'cancelled' ? 'todo-inline-text--done' : ''}>{item.content}</span>
                </div>
            ))}
        </div>
    )
}

export function TodoToolRow({ tool, isError }: ToolRowProps) {
    return (
        <BasicTool
            badge="TODO"
            title="Todos"
            status={tool.status}
            duration={formatToolDuration(tool.time)}
            defaultOpen
        >
            <div className="todo-tool-content">
                <TodoInlineList input={tool.input} output={tool.output} />
            </div>
            {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
        </BasicTool>
    )
}
