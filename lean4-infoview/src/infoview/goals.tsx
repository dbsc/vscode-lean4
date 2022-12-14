import * as React from 'react'
import { InteractiveCode } from './interactiveCode'
import { InteractiveGoal, InteractiveGoals, InteractiveHypothesisBundle, InteractiveHypothesisBundle_nonAnonymousNames, TaggedText_stripTags } from '@leanprover/infoview-api'
import { WithTooltipOnHover } from './tooltips';
import { Collapsible } from './collapsing';
import { EditorContext } from './contexts';

/** Returns true if `h` is inaccessible according to Lean's default name rendering. */
function isInaccessibleName(h: string): boolean {
    return h.indexOf('✝') >= 0;
}

function goalToString(g: InteractiveGoal): string {
    let ret = ''

    if (g.userName) {
        ret += `case ${g.userName}\n`
    }

    for (const h of g.hyps) {
        const names = InteractiveHypothesisBundle_nonAnonymousNames(h).join(' ')
        ret += `${names} : ${TaggedText_stripTags(h.type)}`
        if (h.val) {
            ret += ` := ${TaggedText_stripTags(h.val)}`
        }
        ret += '\n'
    }

    ret += `⊢ ${TaggedText_stripTags(g.type)}`

    return ret
}

export function goalsToString(goals: InteractiveGoals): string {
    return goals.goals.map(goalToString).join('\n\n')
}

interface GoalFilterState {
    /** If true reverse the list of hypotheses, if false present the order received from LSP. */
    reverse: boolean,
    /** If true show hypotheses that have isType=True, otherwise hide them. */
    showType: boolean,
    /** If true show hypotheses that have isInstance=True, otherwise hide them. */
    showInstance: boolean,
    /** If true show hypotheses that contain a dagger in the name, otherwise hide them. */
    showHiddenAssumption: boolean
    /** If true show the bodies of let-values, otherwise hide them. */
    showLetValue: boolean;
}

function getFilteredHypotheses(hyps: InteractiveHypothesisBundle[], filter: GoalFilterState): InteractiveHypothesisBundle[] {
    return hyps.reduce((acc: InteractiveHypothesisBundle[], h) => {
        if (h.isInstance && !filter.showInstance) return acc
        if (h.isType && !filter.showType) return acc
        const names = filter.showHiddenAssumption ? h.names : h.names.filter(n => !isInaccessibleName(n))
        const hNew: InteractiveHypothesisBundle = filter.showLetValue ? { ...h, names } : { ...h, names, val: undefined }
        if (names.length !== 0) acc.push(hNew)
        return acc
    }, [])
}

interface HypProps {
    hyp: InteractiveHypothesisBundle
}

function Hyp({ hyp: h }: HypProps) {
    let namecls : string = ''
    if (h.isInserted) {
        namecls += 'inserted-text '
    } else if (h.isRemoved) {
        namecls += 'removed-text '
    }
    const names = InteractiveHypothesisBundle_nonAnonymousNames(h).map((n, i) =>
        <span className={ 'mr1 ' + (isInaccessibleName(n) ? 'goal-inaccessible ' : '') + namecls} key={i}>{n}</span>
    )
    return <div>
        <strong className="goal-hyp">{names}</strong>
        :&nbsp;
        <InteractiveCode fmt={h.type} />
        {h.val && <>&nbsp;:=&nbsp;<InteractiveCode fmt={h.val} /></>}
    </div>
}

interface GoalProps {
    goal: InteractiveGoal
    filter: GoalFilterState
}

/**
 * Displays the hypotheses, target type and optional case label of a goal according to the
 * provided `filter`. */
export const Goal = React.memo((props: GoalProps) => {
    const { goal, filter } = props
    const prefix = goal.goalPrefix ?? '⊢ '
    const filteredList = getFilteredHypotheses(goal.hyps, filter);
    const hyps = filter.reverse ? filteredList.slice().reverse() : filteredList;
    const goalLi = <div key={'goal'}>
        <strong className="goal-vdash">{prefix}</strong>
        <InteractiveCode fmt={goal.type} />
    </div>
    let cn = 'font-code tl pre-wrap mv1 bl bw1 pl1 b--transparent '
    if (props.goal.isInserted) {
        cn += 'b--inserted '
    }
    if (props.goal.isRemoved) {
        cn += 'b--removed '
    }
    return <div className={cn}>
        {goal.userName && <div key={'case'}><strong className="goal-case">case </strong>{goal.userName}</div>}
        {filter.reverse && goalLi}
        {hyps.map((h, i) => <Hyp hyp={h} key={i} />)}
        {!filter.reverse && goalLi}
    </div>
})

interface GoalsProps {
    goals: InteractiveGoals
    filter: GoalFilterState
}

function Goals({ goals, filter }: GoalsProps) {
    if (goals.goals.length === 0) {
        return <>Goals accomplished 🎉</>
    } else {
        return <>
            {goals.goals.map((g, i) => <Goal key={i} goal={g} filter={filter} />)}
        </>
    }
}

interface FilteredGoalsProps {
    header: React.ReactNode
    /**
     * When this is `undefined`, the component will not appear at all but will remember its state
     * by virtue of still being mounted in the React tree. When it does appear again, the filter
     * settings and collapsed state will be as before. */
    goals?: InteractiveGoals
}

/**
 * Display goals together with a header containing custom contents as well as buttons to control
 * how the goals are displayed.
 */
export function FilteredGoals({ header, goals }: FilteredGoalsProps) {
    const ec = React.useContext(EditorContext)

    const copyToCommentButton =
        <a className="link pointer mh2 dim codicon codicon-quote"
            data-id="copy-goal-to-comment"
            onClick={e => {
                e.preventDefault();
                if (goals) ec.copyToComment(goalsToString(goals))
            }}
            title="copy state to comment" />

    const [goalFilters, setGoalFilters] = React.useState<GoalFilterState>(
        { reverse: false, showType: true, showInstance: true, showHiddenAssumption: true, showLetValue: true });

    const sortClasses = 'link pointer mh2 dim codicon ' + (goalFilters.reverse ? 'codicon-arrow-up ' : 'codicon-arrow-down ');
    const sortButton =
        <a className={sortClasses} title="reverse list"
            onClick={_ => setGoalFilters(s => ({ ...s, reverse: !s.reverse }))} />

    const mkFilterButton = (filterFn: React.SetStateAction<GoalFilterState>, filledFn: (_: GoalFilterState) => boolean, name: string) =>
        <a className='link pointer tooltip-menu-content' onClick={_ => { setGoalFilters(filterFn) }}>
            <span className={'tooltip-menu-icon codicon ' + (filledFn(goalFilters) ? 'codicon-check ' : 'codicon-blank ')}>&nbsp;</span>
            <span className='tooltip-menu-text '>{name}</span>
        </a>
    const filterMenu = <span>
        {mkFilterButton(s => ({ ...s, showType: !s.showType }), gf => gf.showType, 'types')}
        <br/>
        {mkFilterButton(s => ({ ...s, showInstance: !s.showInstance }), gf => gf.showInstance, 'instances')}
        <br/>
        {mkFilterButton(s => ({ ...s, showHiddenAssumption: !s.showHiddenAssumption }), gf => gf.showHiddenAssumption, 'hidden assumptions')}
        <br/>
        {mkFilterButton(s => ({ ...s, showLetValue: !s.showLetValue }), gf => gf.showLetValue, 'let-values')}
    </span>

    const isFiltered = !goalFilters.showInstance || !goalFilters.showType || !goalFilters.showHiddenAssumption || !goalFilters.showLetValue
    const filterButton =
        <WithTooltipOnHover mkTooltipContent={() => filterMenu}>
            <a className={'link pointer mh2 dim codicon ' + (isFiltered ? 'codicon-filter-filled ': 'codicon-filter ')}/>
        </WithTooltipOnHover>

    return <div style={{display: goals !== undefined ? 'block' : 'none'}}>
        <Collapsible>
            <>{header} <span className='fr'>{copyToCommentButton}{sortButton}{filterButton}</span></>
            {goals && <Goals goals={goals} filter={goalFilters}></Goals>}
        </Collapsible>
    </div>
}
