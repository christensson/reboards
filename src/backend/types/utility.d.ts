/**
 * Extracts an RPC signature from an HTTP handler function for the generated API client.
 *
 * The context type is inferred from the handler parameter and then dissected
 * structurally, so handlers that narrow the scope (for example
 * `CtxGet<Res, never, 'global'>`) are supported as well as the defaults.
 *
 * @example
 * export default function handle(ctx: CtxPost<CreateBody, Response>) { ... }
 * export type Handle = typeof handle;
 * // api.global.create: (body: CreateBody, query?: Partial<{}>) => Promise<Response>
 */
type HandlerContext<T> = T extends (ctx: infer C) => void ? C : never;

type ContextResponse<C> = C extends {response: {json: (object: infer R) => void}} ? R : never;

type ContextBody<C> = C extends {request: {json: () => infer B}} ? B : never;

type ContextQuery<C> = C extends {request: {query: infer Q}} ? Q : never;

type QueryArg<Q> = [Q] extends [never] ? Record<string, never> : Partial<Q>;

export type ExtractRPCFromHandler<T> = [ContextBody<HandlerContext<T>>] extends [never]
  ? (query?: QueryArg<ContextQuery<HandlerContext<T>>>) => Promise<ContextResponse<HandlerContext<T>>>
  : (
      body: ContextBody<HandlerContext<T>>,
      query?: QueryArg<ContextQuery<HandlerContext<T>>>
    ) => Promise<ContextResponse<HandlerContext<T>>>;
