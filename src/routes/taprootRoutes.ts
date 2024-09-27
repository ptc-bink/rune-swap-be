import { Router } from 'express';
import { createTaprootMultisig } from '../controller/taprootController';

const taprootRouter = Router();

taprootRouter.use(async (req, res, next) => {
    console.log('');
    console.log(`Request received for ${req.method} ${req.url}`);
    next();
})

taprootRouter.post('/generateTaprootMultisig', async (req, res, next) => {
    try {
        const { runeId1, runeId2, adminDivisibility1, adminDivisibility2 } = req.body;

        const payload = await createTaprootMultisig(runeId1, runeId2, adminDivisibility1, adminDivisibility2);

        console.log("payload after create taproot multisig ==> ", payload);

        return res.status(200).send(payload);
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