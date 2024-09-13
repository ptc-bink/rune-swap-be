import { Router } from 'express';
import { createTaprootMultisig } from '../controller/taprootController';

const taprootRouter = Router();

taprootRouter.use(async (req, res, next)  => {
    console.log('');
    console.log(`Request received for ${req.method} ${req.url}`);
    next();
})

taprootRouter.post('/generateTaprootMultisig', async (req, res, next) => {
    try {
        const payload = await createTaprootMultisig();

        console.log("payload after create taproot multisig ==> ", payload);

        return res.status(200).send({
            success: payload.success,
            message: payload.message,
            payload: {
                vault: null,
                rune: null,
            },
        });
    } catch (error: any) {
        console.error(error);
        return res.status(500).send({
            success: false,
            message: "There is Something wrong..",
            payload: null,
        });
    }
});

export default taprootRouter;